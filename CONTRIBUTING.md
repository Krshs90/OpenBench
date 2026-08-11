# Contributing to OpenBench

First off, thank you for considering contributing to OpenBench! It's people like you that make OpenBench such a great tool.

## Where to Start?
1. Check the [Issues](https://github.com/Krshs90/OpenBench/issues) page to see if someone is already working on what you want to do.
2. If it's a new feature, open a Feature Request issue first to discuss it.
3. Fork the repository and create a new branch.

## Development Setup
OpenBench requires **Node.js**, **Rust**, and a local LLM runner like **Ollama** installed on your system.

1. Clone your fork: \git clone https://github.com/YOUR-USERNAME/OpenBench.git\
2. Install dependencies: \
pm install\
3. Run the dev server: \
pm run tauri dev\

## Pull Request Process
1. Ensure your code compiles correctly (\cargo check\ and \
pm run build\).
2. Do not include any personal information or API keys.
3. Fill out the Pull Request template completely.
4. All Pull Requests are automatically scanned for security vulnerabilities by GitHub Actions.
