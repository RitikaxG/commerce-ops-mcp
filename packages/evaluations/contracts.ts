import type {
  DemoCaseCategory,
  ReviewReasonCode,
} from "@repo/schemas";

export const DIRECT_MCP_FORBIDDEN_TOOL_NAMES = [
  "run_sql",
  "execute_sql",
  "query_database",
  "update_order",
  "update_payment",
  "reserve_inventory",
  "release_inventory",
  "reassign_warehouse",
  "release_hold",
  "retry_fulfilment",
  "create_fulfilment",
  "create_shipment",
  "retry_shipment",
  "update_shipment",
  "call_api",
  "fetch_url",
] as const;

export const DIRECT_MCP_CATEGORY_BY_ORDER_ID = {
  "ORD-1042": "INVENTORY",
  "ORD-1043": "FULFILMENT",
  "ORD-1044": "PROCESSING",
  "ORD-1045": "SHIPPING",
  "ORD-1046": "DATA_QUALITY",
  "ORD-1047": "SHIPMENT",
  "ORD-1048": "GENERAL",
  "ORD-1049": "PAYMENT",
  "ORD-1050": "DATA_QUALITY",
} as const satisfies Record<string, DemoCaseCategory>;

export const DIRECT_MCP_REASON_BY_ORDER_ID = {
  "ORD-1042": "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
  "ORD-1043": "FULFILMENT_CREATION_FAILED",
  "ORD-1045": "SHIPMENT_LABEL_CREATION_FAILED",
  "ORD-1046": "MISSING_EVIDENCE",
  "ORD-1048": "CAUSE_NOT_DETERMINED",
  "ORD-1049": "PAYMENT_NOT_CONFIRMED",
  "ORD-1050": "CONFLICTING_EVIDENCE",
} as const satisfies Record<string, ReviewReasonCode>;
