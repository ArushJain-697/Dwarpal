# The attacker box: curl for the crafted suite, sqlmap for the SQLi hammer,
# autocannon for the load test.

FROM node:22-alpine

RUN apk add --no-cache curl bash python3 py3-pip \
    && pip install --break-system-packages --no-cache-dir sqlmap \
    && npm install -g autocannon

COPY attacks /attacks
RUN chmod +x /attacks/*.sh

WORKDIR /attacks
CMD ["sh"]
