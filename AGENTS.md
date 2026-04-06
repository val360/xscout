# AGENTS.md

## Cursor Cloud specific instructions

**xscout** is a Java CLI application that monitors the XRP Ledger transaction stream via WebSocket. There is no web UI, no database, and no Docker infrastructure.

### Prerequisites
- **Java 8+** (OpenJDK 21 is pre-installed on the VM)
- **Apache Maven 3.x** (installed via `sudo apt-get install -y maven` during setup)

### Build & Run
- See `README.md` for the canonical run command: `mvn compile exec:java`
- The app accepts an optional integer argument for transaction count: `mvn compile exec:java -Dexec.args="5"` (default: 100)
- The application connects to `wss://fh.xrpl.ws` (public XRP Ledger WebSocket) and requires outbound internet access

### Caveats
- There are no automated tests in this project (no `src/test` directory)
- There is no linter configured
- The default run (`mvn compile exec:java`) collects 100 transactions before exiting, which can take a while depending on network activity. Use `-Dexec.args="N"` with a small number for quick verification.
- First run after dependency resolution may take longer as Maven downloads exec-maven-plugin transitive dependencies at execution time
