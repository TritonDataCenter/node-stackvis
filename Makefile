#
# Copyright (c) 2012, Joyent, Inc. All rights reserved.
#
# Makefile: top-level Makefile
#
# This Makefile contains only repo-specific logic and uses included makefiles
# to supply common targets (javascriptlint, jsstyle, restdown, etc.), which are
# used by other repos as well.
#

#
# Tools
#
NPM		 = npm
CATEST		 = tools/catest

#
# Files
#
JS_FILES	:= $(shell find cmd lib test -name '*.js' \
			-not -path 'lib/www/*')

JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_CONF_WEB	 = tools/jsl.web.conf
JSL_FILES_NODE   = $(JS_FILES)
JSL_FILES_WEB   := $(shell find lib/www -name '*.js' \
			-not -name 'd3.*.js')

JSSTYLE_FLAGS    = -oleading-right-paren-ok=1
JSSTYLE_FILES	 = $(JSL_FILES_NODE) $(JSL_FILES_WEB)

JSTEST_FILES	:= $(shell find test -name 'tst.*.js')

#
# Repo-specific targets
#
.PHONY: all
all:
	$(NPM) install

.PHONY: test
test:
	$(CATEST) $(JSTEST_FILES)

include ./Makefile.deps
include ./Makefile.targ
