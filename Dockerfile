FROM ubuntu:24.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies for downloading and extracting Go
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Set the Go version and download link
ENV GO_VERSION=1.26.1
ENV GO_DOWNLOAD_URL=https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz

# Download and install Go
RUN curl -fsSL "$GO_DOWNLOAD_URL" -o go.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

# Set up Go environment variables
ENV PATH=$PATH:/usr/local/go/bin
ENV GOPATH=/go
ENV PATH=$PATH:$GOPATH/bin
ENV GOROOT=/usr/local/go

# Create the GOPATH directory
RUN mkdir -p "$GOPATH/src" "$GOPATH/bin" && chmod -R 777 "$GOPATH"