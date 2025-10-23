.PHONY: default

lint:
	cd src-tauri && cargo clippy
fmt:
	cd src-tauri && cargo fmt --all --
dev:
	cargo tauri dev
icon:
	cargo tauri icon ./HTTPulse.png
build:
	cargo tauri build
clean:
	cd src-tauri && cargo clean
install-cli:
	@echo "Using npm tauri instead. Run: npm install"
install-orm-cli:
	cargo install sea-orm-cli
orm:
	cd src-tauri && sea-orm-cli generate entity --with-serde=both \
    -u "sqlite:///~/Library/Application Support/com.bigtree.HTTPulse/my_db.db" \
    -o src/entities
version:
	git cliff --unreleased --tag 0.1.21 --prepend CHANGELOG.md

