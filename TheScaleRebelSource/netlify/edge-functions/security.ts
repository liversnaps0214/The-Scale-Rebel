import type { Context, Config } from "@netlify/edge-functions";

// ============================================================================
// SECURITY EDGE FUNCTION
// Blocks malicious requests before they reach the origin
// ============================================================================

// Blocked file extensions - commonly targeted by bots looking for vulnerabilities
const BLOCKED_EXTENSIONS = [
  ".php",
  ".asp",
  ".aspx",
  ".jsp",
  ".cgi",
  ".pl",
  ".exe",
  ".dll",
  ".env",
  ".git",
  ".bak",
  ".sql",
  ".config",
  ".ini",
  ".log",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".rb",
  ".jar",
  ".war",
  ".class",
];

// Blocked path patterns - WordPress, common CMS, and exploit paths
const BLOCKED_PATH_PATTERNS = [
  // WordPress-specific paths
  /\/wp-admin/i,
  /\/wp-content/i,
  /\/wp-includes/i,
  /\/wp-login/i,
  /\/wp-config/i,
  /\/wp-json/i,
  /\/xmlrpc/i,
  /\/wp-cron/i,
  /\/wp-trackback/i,
  /\/wp-comments/i,
  /\/wordpress/i,

  // Common CMS paths
  /\/administrator/i,
  /\/joomla/i,
  /\/drupal/i,
  /\/magento/i,
  /\/phpmyadmin/i,
  /\/cpanel/i,
  /\/plesk/i,
  /\/webmail/i,
  /\/roundcube/i,
  /\/squirrelmail/i,

  // Shell/exploit paths
  /\/shell/i,
  /\/c99/i,
  /\/r57/i,
  /\/alfa/i,
  /\/b374k/i,
  /\/weevely/i,
  /\/wso/i,

  // Configuration and sensitive files
  /\.git\//i,
  /\.svn\//i,
  /\.hg\//i,
  /\.env$/i,
  /\.env\./i,
  /\.htaccess/i,
  /\.htpasswd/i,
  /\.npmrc/i,
  /\.dockerenv/i,
  /\/\.well-known\/(?!acme-challenge)/i,

  // Backup files
  /\.bak$/i,
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,
  /\.save$/i,
  /\.swp$/i,
  /~$/,

  // Database dumps
  /\.sql$/i,
  /dump\./i,
  /backup\./i,
  /database\./i,
  /db\./i,

  // Common attack paths
  /\/cgi-bin\//i,
  /\/scripts\//i,
  /\/bin\//i,
  /\/etc\/passwd/i,
  /\/proc\//i,
  /\/var\/log/i,
  /\/tmp\//i,

  // Probe paths
  /\/eval/i,
  /\/exec/i,
  /\/system/i,
  /\/passthru/i,
  /\/actuator/i,
  /\/console/i,
  /\/debug/i,
  /\/trace/i,
  /\/manager/i,
  /\/api\/v[0-9]+\/admin/i,

  // Common vulnerability endpoints
  /\/solr/i,
  /\/jenkins/i,
  /\/struts/i,
  /\/log4j/i,
  /\/vendor\//i,
  /\/node_modules\//i,
  /\/bower_components\//i,
];

// Suspicious query parameter patterns
const BLOCKED_QUERY_PATTERNS = [
  /(\%00|\\x00)/i, // Null byte injection
  /<script/i, // XSS attempts
  /javascript:/i, // JavaScript protocol
  /vbscript:/i, // VBScript protocol
  /data:/i, // Data protocol
  /base64,/i, // Base64 encoded payloads
  /union\s+select/i, // SQL injection
  /select\s+.*\s+from/i, // SQL injection
  /insert\s+into/i, // SQL injection
  /drop\s+table/i, // SQL injection
  /delete\s+from/i, // SQL injection
  /update\s+.*\s+set/i, // SQL injection
  /;.*--/i, // SQL comment injection
  /\.\.\//i, // Path traversal
  /%2e%2e/i, // Encoded path traversal
  /\$\{.*\}/i, // Template injection (Log4Shell, etc.)
  /\{\{.*\}\}/i, // Template injection
  /\$poison/i, // Specific attack pattern
  /eval\s*\(/i, // Code execution
  /exec\s*\(/i, // Code execution
  /cmd=/i, // Command injection
  /passwd/i, // Password file access
  /etc\/shadow/i, // Shadow file access
  /phpinfo/i, // PHP info disclosure
  /system\s*\(/i, // System call
  /file:\/\//i, // File protocol
  /gopher:\/\//i, // Gopher protocol
  /dict:\/\//i, // Dict protocol
];

// Suspicious User-Agent patterns
const BLOCKED_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zmeu/i,
  /morfeus/i,
  /zgrab/i,
  /gobuster/i,
  /dirbuster/i,
  /wpscan/i,
  /nessus/i,
  /openvas/i,
  /nuclei/i,
  /acunetix/i,
  /burpsuite/i,
  /havij/i,
  /w3af/i,
  /arachni/i,
  /qualys/i,
  /^$/i, // Empty user agent
];

// Suspicious request headers that indicate malicious intent
const SUSPICIOUS_HEADERS = [
  "x-forwarded-host", // Host header injection
  "x-original-url", // URL override attempts
  "x-rewrite-url", // URL rewrite attempts
];

function isBlockedExtension(pathname: string): boolean {
  const lowerPath = pathname.toLowerCase();
  return BLOCKED_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

function isBlockedPath(pathname: string): boolean {
  return BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function hasSuspiciousQuery(search: string): boolean {
  if (!search) return false;
  return BLOCKED_QUERY_PATTERNS.some((pattern) => pattern.test(search));
}

function isSuspiciousUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true; // Block requests with no User-Agent
  return BLOCKED_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}

function hasSuspiciousHeaders(request: Request): boolean {
  for (const header of SUSPICIOUS_HEADERS) {
    if (request.headers.has(header)) {
      return true;
    }
  }
  return false;
}

// Check for oversized requests that could be DoS attempts
function isOversizedRequest(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    // Block requests larger than 1MB for a static site
    if (size > 1048576) {
      return true;
    }
  }
  return false;
}

export default async (request: Request, context: Context): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search;
  const userAgent = request.headers.get("user-agent");

  // Check for oversized requests
  if (isOversizedRequest(request)) {
    console.log(`Blocked request (oversized): ${pathname}`);
    return new Response("Payload Too Large", { status: 413 });
  }

  // Check for blocked file extensions
  if (isBlockedExtension(pathname)) {
    console.log(`Blocked request (extension): ${pathname}`);
    return new Response("Not Found", { status: 404 });
  }

  // Check for blocked path patterns
  if (isBlockedPath(pathname)) {
    console.log(`Blocked request (path pattern): ${pathname}`);
    return new Response("Not Found", { status: 404 });
  }

  // Check for suspicious query parameters
  if (hasSuspiciousQuery(search)) {
    console.log(`Blocked request (suspicious query): ${pathname}${search}`);
    return new Response("Bad Request", { status: 400 });
  }

  // Check for suspicious headers
  if (hasSuspiciousHeaders(request)) {
    console.log(`Blocked request (suspicious headers): ${pathname}`);
    return new Response("Bad Request", { status: 400 });
  }

  // Check for suspicious user agents
  if (isSuspiciousUserAgent(userAgent)) {
    // For known malicious scanners, block the request
    if (
      userAgent &&
      /sqlmap|nikto|zmeu|morfeus|zgrab|wpscan|acunetix|havij|w3af/i.test(userAgent)
    ) {
      console.log(`Blocked request (malicious UA): ${userAgent} for ${pathname}`);
      return new Response("Forbidden", { status: 403 });
    }
    // Log but allow empty/suspicious UAs to reduce false positives
    console.log(`Suspicious user agent detected: ${userAgent || "(empty)"} for ${pathname}`);
  }

  // Check for HTTP method abuse (block unusual methods for static sites)
  const method = request.method.toUpperCase();
  const isAdminPath = pathname.startsWith("/api/admin/");
  const allowedMethods = isAdminPath
    ? ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE"]
    : ["GET", "HEAD", "OPTIONS", "POST"];
  if (!allowedMethods.includes(method)) {
    console.log(`Blocked request (method): ${method} ${pathname}`);
    return new Response("Method Not Allowed", { status: 405 });
  }

  // For POST requests, only allow to specific endpoints
  if (method === "POST") {
    const allowedPostPaths = ["/api/send-email", "/api/admin/", "/.netlify/functions/"];
    const isAllowedPost = allowedPostPaths.some(
      (path) => pathname.startsWith(path)
    );
    if (!isAllowedPost) {
      console.log(`Blocked POST to non-allowed path: ${pathname}`);
      return new Response("Method Not Allowed", { status: 405 });
    }
  }

  // Continue to the next handler (serve the actual content)
  return context.next();
};

export const config: Config = {
  path: "/*",
  excludedPath: ["/.netlify/*"],
};
