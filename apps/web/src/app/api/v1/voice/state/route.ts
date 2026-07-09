import { deleteVoiceStateRoute, postVoiceStateRoute } from "./route-logic";

export async function POST(request: Request) {
  return postVoiceStateRoute(request);
}

export async function DELETE(request: Request) {
  return deleteVoiceStateRoute(request);
}
