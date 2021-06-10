package internal

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

func MustEnv(name string) string {
	v := os.Getenv(name)
	if v == "" {
		log.Fatalf("missing environment variable %s", name)
	}
	return v
}

func MayEnv(name string, defaultValue ...string) string {
	v := os.Getenv(name)
	if v != "" {
		return v
	}
	if len(defaultValue) > 0 {
		return defaultValue[0]
	}
	return ""
}

func MayEnvBool(name string, defaultValue bool) bool {
	v := os.Getenv(name)
	if v == "" {
		v = fmt.Sprintf("%v", defaultValue)
	}
	return v == "1" || strings.ToLower(v) == "true"
}

func MayEnvInt(name string, defaultValue int) int {
	v := os.Getenv(name)
	if v == "" {
		v = strconv.Itoa(defaultValue)
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("environment variable %s contains invalid value \"%s\": %s", name, v, err)
	}
	return i
}
