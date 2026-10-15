# Native installer plus a standalone PC setup host.
PYTHON := python3
LOADER := third_party/ps5-webkit-remote-loader
INSTALLER_COMMON := $(LOADER)/installer/common
include $(INSTALLER_COMMON)/common.mk
SDK := /opt/ps5-payload-sdk
CC := $(SDK)/bin/prospero-clang
STRIP := $(SDK)/bin/prospero-strip
TARGET := $(SDK)/target
CFLAGS := -Os -Wall -ffunction-sections -fdata-sections -Iinclude -I$(INSTALLER_COMMON) -I$(TARGET)/include
LDFLAGS := -Wl,--gc-sections
LIBS := $(TARGET)/lib/libmicrohttpd.a -L$(TARGET)/lib -lpthread \
        -lSceNetCtl -lSceUserService -lSceSystemService -lSceAppInstUtil
SRCS := src/main.c src/http_server.c $(INSTALLER_COMMON_SRCS)
ELF := installer.elf

# One version per make invocation, including dirty-tree builds.
ifndef BUILD_VERSION
BUILD_VERSION := $(shell $(PYTHON) tools/gen_version.py --print)
endif
export BUILD_VERSION

ifndef BUILD_TITLE
BUILD_TITLE := $(shell $(PYTHON) tools/gen_version.py --title)
endif

BUILDER := $(PYTHON) $(LOADER)/tools/build_standalone.py
CHAINS := poops relapse
# One standalone page per chain, carrying elfldr-check.js, the chain's exploit,
# then autoload.js. The chain sources are unmodified
# submodule payloads; each exploit prefetches elfldr/kexp itself.
# Autoloader appearance is embedded through the upstream builder's hooks.
# Each variable accepts a whitespace-separated list of file paths.
PAGE_CSS ?= frontend/autoloader/style.css
PAGE_JS ?= frontend/autoloader/app.js
PAGE_CONFIG := build/page-config.js
ELFLDR_TAG := v0.26-bb1e117
ELFLDR_VIRTUAL := shared/elfldr-ps5-$(ELFLDR_TAG).elf
PAGE_FLAGS := --elfldr $(ELFLDR_VIRTUAL)=build/deps/elfldr.elf \
              $(foreach file,$(PAGE_CSS),--css "$(file)") \
              --js "$(PAGE_CONFIG)" \
              $(foreach file,$(PAGE_JS),--js "$(file)")
APP_PAGE := build/autoloader/index.html
STAGE := frontend/dist
UMTX2_DIR := frontend/umtx2
REGISTRY := include/file_registry.h include/file_registry.c
ICONS := assets/icon0.png assets/icon.ico
INSTALLER_LOGO := frontend/installer-page/logo.svg
HOST_INDEX := frontend/host-index/index.html
HOST_STAGE := build/host
HOST_PAYLOAD ?= $(ELF)
PAYLOAD_TAG ?= $(shell git -C third_party/ps5-unified-autoloader describe --tags --always 2>/dev/null || echo v0.1.5-915a65e)
AUTOLOAD_PAYLOAD_VIRTUAL ?= ps5-unified-autoloader-$(PAYLOAD_TAG).elf
HOST_PAYLOAD_VIRTUAL ?= $(if $(filter-out installer.elf,$(notdir $(HOST_PAYLOAD))),$(notdir $(HOST_PAYLOAD)),webkit-autoloader-installer_v$(BUILD_VERSION).elf)

# Optional cache-repair hardware test builds; use make clean all when changing.
SIMULATE ?= 0
ifneq ($(SIMULATE),0)
CFLAGS += -DINSTALLER_SIMULATE_CACHE_CORRUPTION=$(SIMULATE)
endif

all: $(ELF)

version:
	$(PYTHON) tools/gen_version.py

print-version:
	@echo $(BUILD_VERSION)

test:
	node tools/test_elfldr_check.js
	node tools/test_autoload_payload.js
	node tools/test_installer.js
	node tools/test_selection_flow.js
	node tools/test_umtx2.js

# Run on Linux or in the SDK container; PS5 services are stubbed.
test-native:
	$(PYTHON) $(LOADER)/tools/installer_common_test.py

icons: $(ICONS) $(INSTALLER_LOGO)
assets/icon0.png: assets/icon.svg tools/gen_icons.py
	$(PYTHON) tools/gen_icons.py
assets/icon.ico: assets/icon0.png
	@test -f $@ || $(PYTHON) tools/gen_icons.py

$(INSTALLER_LOGO): assets/icon.svg
	cp $< $@

payload-deps:
	./tools/download_deps.sh

# Regenerate frontend/umtx2 from the pristine submodule plus our autoload
# patch. Deterministic, so it runs before every consumer (registry, host, dev).
umtx2-prepare:
	PYTHON=$(PYTHON) ./tools/apply_umtx2_patch.sh

# One page per chain: ELF loader check first, then exploit and autoload. Both
# are cached, so the choice of chain never has to invalidate anything.
page: payload-deps
	@mkdir -p build/autoloader
	$(PYTHON) tools/gen_version.py --page-config $(PAGE_CONFIG)
	@for chain in $(CHAINS); do \
	    echo "$(BUILDER) payloads/$$chain.js -> build/autoloader/$$chain.html"; \
	    $(BUILDER) $(CURDIR)/payloads/elfldr-check.js payloads/$$chain.js $(CURDIR)/payloads/autoload.js::$(AUTOLOAD_PAYLOAD_VIRTUAL) \
	        --title "$(BUILD_TITLE)" $(PAGE_FLAGS) \
	        --embed $(AUTOLOAD_PAYLOAD_VIRTUAL)=build/deps/autoload.elf \
	        -o $(CURDIR)/build/autoloader/$$chain.html || exit 1; \
	done

# The native cache: chain pages, the multi-file umtx2 chain, and the shared
# ELFs umtx2 fetches (../elfldr.elf = shared elfldr, ../autoload.elf = the
# bundled unified autoloader — on the console both live one directory up).
registry: version page umtx2-prepare $(INSTALLER_LOGO)
	rm -rf $(STAGE)
	@mkdir -p $(STAGE)/app/$(BUILD_VERSION)
	cp frontend/installer-page/index.html $(INSTALLER_LOGO) $(STAGE)/
	cp frontend/pointer/index.html $(STAGE)/app/index.html
	@for chain in $(CHAINS); do \
	    cp build/autoloader/$$chain.html $(STAGE)/app/$(BUILD_VERSION)/$$chain.html || exit 1; \
	done
	cp -R $(UMTX2_DIR) $(STAGE)/app/$(BUILD_VERSION)/umtx2
	cp build/deps/elfldr.elf build/deps/autoload.elf $(STAGE)/app/$(BUILD_VERSION)/
	@echo "$(BUILD_VERSION)" > $(STAGE)/VERSION
	$(PYTHON) tools/gen_file_registry.py $(STAGE) $(word 1,$(REGISTRY)) $(word 2,$(REGISTRY))

$(ELF): registry icons $(SRCS) $(wildcard include/*.h) $(INSTALLER_COMMON_HEADERS)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SRCS) include/file_registry.c $(LIBS)
	$(STRIP) $@

# The setup host packages a full docroot into webkit-autoloader-host.py: the
# router index.html, both standalone chain pages (installer ELF embedded), the
# multi-file umtx2 chain, and the ELFs it fetches. On the PC host autoload.elf
# is the installer ELF — the setup flow loads the installer, not the console
# autoloader. build_host.py zips the stage into the single-file script.
host: $(HOST_PAYLOAD) payload-deps umtx2-prepare
	rm -rf $(HOST_STAGE)
	@mkdir -p $(HOST_STAGE)
	$(PYTHON) tools/gen_version.py --page-config $(PAGE_CONFIG)
	$(BUILDER) $(CURDIR)/payloads/elfldr-check.js payloads/relapse.js $(CURDIR)/payloads/autoload.js::$(HOST_PAYLOAD_VIRTUAL) \
	    --title "$(BUILD_TITLE)" $(PAGE_FLAGS) \
	    --embed $(HOST_PAYLOAD_VIRTUAL)=$(HOST_PAYLOAD) -o $(CURDIR)/$(HOST_STAGE)/relapse.html
	$(BUILDER) $(CURDIR)/payloads/elfldr-check.js payloads/poops.js $(CURDIR)/payloads/autoload.js::$(HOST_PAYLOAD_VIRTUAL) \
	    --title "$(BUILD_TITLE)" $(PAGE_FLAGS) \
	    --embed $(HOST_PAYLOAD_VIRTUAL)=$(HOST_PAYLOAD) -o $(CURDIR)/$(HOST_STAGE)/poops.html
	cp $(HOST_INDEX) $(HOST_STAGE)/index.html
	cp -R $(UMTX2_DIR) $(HOST_STAGE)/umtx2
	cp build/deps/elfldr.elf $(HOST_STAGE)/elfldr.elf
	cp $(HOST_PAYLOAD) $(HOST_STAGE)/autoload.elf
	$(PYTHON) tools/build_host.py --frontend $(HOST_STAGE) --output webkit-autoloader-host.py

# Full docroot preview on the dev machine: the standalone chain pages, the
# umtx2 chain with the shared ELFs it fetches (the bundled unified autoloader,
# as on the console), and the installer page at the root.
dev: page umtx2-prepare
	rm -rf build/dev
	@mkdir -p build/dev
	cp build/autoloader/poops.html build/autoloader/relapse.html build/dev/
	cp -R $(UMTX2_DIR) build/dev/umtx2
	cp frontend/installer-page/index.html build/dev/index.html
	cp $(INSTALLER_LOGO) build/dev/logo.svg
	cp build/deps/elfldr.elf build/dev/elfldr.elf
	cp build/deps/autoload.elf build/dev/autoload.elf
	$(PYTHON) -m http.server 8123 --bind 127.0.0.1 --directory build/dev

clean:
	rm -rf $(STAGE) build/autoloader $(HOST_STAGE) build/dev $(UMTX2_DIR)
	rm -f $(ELF) $(REGISTRY) include/wkali_version.h webkit-autoloader-host.py
	rm -f $(PAGE_CONFIG)

.PHONY: all version print-version test test-native icons payload-deps umtx2-prepare page registry host dev clean
