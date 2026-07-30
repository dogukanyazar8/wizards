import { adminHelpArticleCreateRoute, adminHelpArticleListRoute } from "./route-logic";

export function GET(request: Request) {
  return adminHelpArticleListRoute(request);
}

export function POST(request: Request) {
  return adminHelpArticleCreateRoute(request);
}
