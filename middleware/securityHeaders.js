/**
 * Middleware, добавляющее общие заголовки ко всем ответам.
 * Стандартный X-Powered-By: Express отключен в app.js и заменен своим.
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Powered-By', 'EventHub PZ1');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  // Скрипты и стили – только со своего сервера (встроенные <script> запрещены)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
}

module.exports = securityHeaders;
