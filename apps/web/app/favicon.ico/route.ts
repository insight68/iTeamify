export function GET(request: Request) {
  return Response.redirect(new URL("/teamify.svg", request.url), 308);
}
