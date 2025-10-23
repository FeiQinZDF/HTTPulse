.PHONY: default

lint:
	cd src-tauri && cargo clippy
fmt:
	cd src-tauri && cargo fmt --all --
dev:
	@echo "Cleaning cache..."
	@if exist "node_modules\\.vite" rmdir /s /q "node_modules\\.vite" 2>nul || true
	@if exist ".vite-cache" rmdir /s /q ".vite-cache" 2>nul || true
	@if exist "dist" rmdir /s /q "dist" 2>nul || true
	@echo "Starting dev server..."
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

