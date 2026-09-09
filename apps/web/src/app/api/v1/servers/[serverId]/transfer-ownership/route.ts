import {
  transferServerOwnershipRoute,
  type TransferServerOwnershipRouteContext,
} from "./route-logic";

export function POST(request: Request, context: TransferServerOwnershipRouteContext) {
  return transferServerOwnershipRoute(request, context);
}
