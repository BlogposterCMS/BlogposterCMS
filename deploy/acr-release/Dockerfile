# Transport the completed, attested 0.10.25 release through ACR's overseas builder.
# Source: refs/tags/v0.10.25, commit 808441cefc6d81df1efacfcfc1bfb4317994a189.
# Keep this stage free of RUN/COPY/ADD: the official runtime and its signed
# integrity baseline must travel together, without rebuilding application code.
FROM ghcr.io/blogpostercms/blogpostercms@sha256:93258193a3e20c6785c12ea41573926d9c4e08aacc2de38d1322ef402823144c
