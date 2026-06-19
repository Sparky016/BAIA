/**
 * Mock MyCMS HTTP server for E2E tests.
 *
 * Serves a minimal CMS-like HTML page at http://localhost:4001 so that the
 * Playwright runner in baia-server can navigate and capture UI behaviour
 * without requiring a live ASP.NET MyCMS instance.
 */
import http from 'node:http';

const PORT = 4001;

const HOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MyCMS – Home</title>
</head>
<body>
  <header>
    <h1>Welcome to MyCMS</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/admin">Admin</a>
    </nav>
  </header>
  <main>
    <section id="content-list">
      <h2>Published Pages</h2>
      <ul>
        <li><a href="/page/1">Getting Started</a></li>
        <li><a href="/page/2">About Us</a></li>
      </ul>
    </section>
    <section id="search">
      <form action="/search" method="get">
        <label for="q">Search:</label>
        <input id="q" name="q" type="text" placeholder="Enter search term" />
        <button type="submit">Search</button>
      </form>
    </section>
  </main>
</body>
</html>`;

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MyCMS – Admin</title>
</head>
<body>
  <h1>Admin Dashboard</h1>
  <p>Only authorised users can access this area.</p>
  <form id="login-form" action="/admin/login" method="post">
    <label for="username">Username:</label>
    <input id="username" name="username" type="text" required />
    <label for="password">Password:</label>
    <input id="password" name="password" type="password" required />
    <button type="submit">Login</button>
  </form>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  const body = url.startsWith('/admin') ? ADMIN_HTML : HOME_HTML;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
});

server.listen(PORT, () => {
  process.stdout.write(`mock-mycms listening on http://localhost:${PORT}\n`);
});
