# Licensing

chinwag uses a dual-license model. The client-side tools that run on your machine are MIT. The backend platform is source-available under BSL 1.1.

## MIT License

The following packages are licensed under the [MIT License](https://opensource.org/licenses/MIT):

- **`packages/mcp/`** — MCP server that runs alongside your AI agents
- **`packages/cli/`** — CLI tool for setup and management
- **`packages/shared/`** — Shared types and utilities

You can use, modify, and distribute these freely with no restrictions.

## Business Source License 1.1

The following packages are licensed under the [BSL 1.1](https://mariadb.com/bsl11/):

- **`packages/worker/`** — Backend API, analytics, and coordination engine
- **`packages/web/`** — Web dashboard

You can read, modify, and self-host these for internal use. The one restriction: you cannot use this code to offer a competing hosted agent coordination service to third parties.

On **2030-04-10**, these packages automatically convert to the **Apache License 2.0** and become fully open source.

## Why this split

The tools that run in your environment (MCP server, CLI) need to be fully open and inspectable — you should be able to audit exactly what runs alongside your AI agents. The backend platform contains the analytics engine and workflow intelligence that power the hosted service.
