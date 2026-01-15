FROM motionproject/motion:latest

# Install curl for webhooks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy configuration and scripts
COPY motion.conf /etc/motion/motion.conf
COPY webhook.sh /etc/motion/webhook.sh

# Ensure executable permissions
RUN chmod +x /etc/motion/webhook.sh

# Create media directory
RUN mkdir -p /var/lib/motion && chown motion:motion /var/lib/motion

# Expose ports (Stream, Webcontrol, Dynamic Streams)
EXPOSE 8081 8082 8101-8120

CMD ["motion", "-n", "-c", "/etc/motion/motion.conf"]
