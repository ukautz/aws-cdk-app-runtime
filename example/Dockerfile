FROM golang:1.16 AS build

ARG service=monitor

ENV CGO_ENABLED="0"
WORKDIR /src
ADD . .
RUN go build -o dist/${service} cmds/${service}/main.go

FROM alpine

ARG service=monitor
ENV service_name=$service

WORKDIR /srv
COPY --from=build /src/dist/$service $service

ENTRYPOINT /srv/${service_name}
