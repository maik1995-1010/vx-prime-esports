export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // VX MMORPG: same-origin gateway to the dedicated game Worker.
    // This keeps the vX PRIME Supabase browser session available at /game/.
    if (url.pathname === "/game" || url.pathname.startsWith("/game/")) {
      return env.GAME_SERVICE.fetch(request);
    }

    // Existing vX PRIME static site.
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    // Preserve the existing SPA fallback behavior.
    if (request.method === "GET") {
      const accept = request.headers.get("accept") || "";
      if (accept.includes("text/html")) {
        const fallbackUrl = new URL(request.url);
        fallbackUrl.pathname = "/index.html";
        return env.ASSETS.fetch(new Request(fallbackUrl, request));
      }
    }

    return response;
  }
};
