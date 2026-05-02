/**
 * Validates a URL to mitigate Server-Side Request Forgery (SSRF) attacks.
 * It blocks access to known cloud metadata services and restricts protocols to http/https.
 */
export function validateSafeUrl(url: URL): void {
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase();

  // Known cloud metadata service hostnames and IPs
  const forbiddenHostnames = new Set([
    '169.254.169.254', // AWS, GCP, Azure, OpenStack
    '100.100.100.200', // Alibaba Cloud
    'metadata.google.internal', // GCP
    'metadata', // General metadata hostname
  ]);

  if (forbiddenHostnames.has(hostname)) {
    throw new Error(`Forbidden hostname: ${hostname}`);
  }

  // IPv6 cloud metadata addresses
  // AWS: [fd00:ec2::254], GCP: [fe80::4001]
  if (hostname === '[fd00:ec2::254]' || hostname === '[fe80::4001]') {
    throw new Error(`Forbidden hostname: ${hostname}`);
  }
}
