/**
 * WAF test corpus.
 *
 * For each category: MALICIOUS payloads that must be blocked, and BENIGN
 * lookalikes that must pass. The benign set is the false-positive guard — the
 * whole point is blocking attacks without blocking real users.
 */

export const CORPUS = {
  sqli: {
    malicious: [
      "1' OR '1'='1",
      "1'+OR+'1'='1", // '+' as space — the form-encoding evasion
      '1 UNION SELECT password FROM users',
      'UNION/**/SELECT secret', // inline-comment evasion
    ],
    benign: [
      'I love the union of jazz',
      "O'Brien",
      'select the best option',
      'well--known fact',
    ],
  },
  xss: {
    malicious: [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:alert(document.cookie)',
      '%EF%BC%9Cscript%EF%BC%9E', // fullwidth <script>
    ],
    benign: ['3 < 5 and 5 > 3', 'a>b comparison', 'the script was great'],
  },
  traversal: {
    malicious: ['../../../../etc/passwd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', '..\\..\\windows'],
    benign: ['reports/2026/summary.pdf', 'a.b.c file name'],
  },
  cmdi: {
    malicious: ['127.0.0.1;id', 'host=x;cat /etc/passwd', 'ping;whoami'],
    benign: ['list=1;2;3', 'a=1; b=2; c=3'],
  },
  ssrf: {
    malicious: ['http://169.254.169.254/latest/meta-data/'],
    benign: ['http://example.com/page', 'https://api.github.com/repos'],
  },
};
