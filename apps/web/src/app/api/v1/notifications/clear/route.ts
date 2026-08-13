import { notificationsClearRoute } from "./route-logic";

export async function DELETE() {
  return notificationsClearRoute();
}
