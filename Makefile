
.PHONY: clean
clean:
	npm run clean

.PHONY: build
build: clean
	npm run build

.PHONY: package
package: clean build
	npm run package

.PHONY: publish
publish: build
	$(eval current_tag=$(shell git describe --tags))
	$(eval package_version=$(shell cat package.json| jq -r .version))
	@if [[ $$(git diff --stat) != '' ]]; then \
		echo 'Git is dirty. Commit before publish'; \
	else \
		if [ "$(current_tag)" == "$(package_version)" ]; then \
			echo "publish version $(package_version)"; \
			npm publish; \
		else \
			echo "Current tag $(current_tag) does not match package version $(package_version)"; \
		fi; \
	fi


.PHONY: test
test: clean
	npm run test

.PHONY: test-coverage
test-coverage: clean
	npm run test -- --coverage

.PHONY: test-update
test-update: clean
	npm run test -- -u --coverage
