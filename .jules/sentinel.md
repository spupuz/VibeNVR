## 2025-02-27 - Webhook Validation SSRF Protection
**Vulnerability:** The webhook URL validation logic explicitly blocked link-local and multicast IPs but failed to block loopback (`127.0.0.1`) and unspecified (`0.0.0.0`) addresses.
**Learning:** This omission allowed potential SSRF attacks targeting internal services running on the loopback interface, bypassing external network controls.
**Prevention:** Ensure all non-routable, non-private internal address ranges (loopback, unspecified, link-local, multicast) are explicitly blocked when validating external URLs provided by users.
