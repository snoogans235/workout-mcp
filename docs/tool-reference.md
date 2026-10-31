# workout-mcp

**Server Version:** 1.0.0 | **MCP Specifications:** 2026-07-28

Reference documentation for the **workout-mcp** MCP server capabilities.

---

## Summary

### Tools (1)

- [`server_status`](#server_status) - Return the local server's status, service name, and application version.




---

## Details

### Tools

#### Tool `server_status`

Return the local server's status, service name, and application version.

**Parameters:**







---

*Generated with [mcpcontract](https://github.com/cisco-open/mcptoolkit-contract)*

## Published tool schemas and annotations

```json
[
  {
    "name": "server_status",
    "inputSchema": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "properties": {},
      "type": "object"
    },
    "outputSchema": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "properties": {
        "service": {
          "const": "workout-mcp",
          "type": "string"
        },
        "status": {
          "const": "ok",
          "type": "string"
        },
        "version": {
          "type": "string"
        }
      },
      "required": [
        "status",
        "service",
        "version"
      ],
      "type": "object"
    },
    "annotations": {
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false,
      "readOnlyHint": true
    }
  }
]
```
