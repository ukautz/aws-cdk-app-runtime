package main

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ukautz/aws-cdk-app-runtime/example/cmds/internal"
	uptime "github.com/ukautz/aws-cdk-app-runtime/example/pkg"
)

func main() {
	log.Println("starting monitor")

	store := internal.InitMetricStore()
	monitor := uptime.Monitor{
		Client: &http.Client{Timeout: time.Second * 5},
	}

	urls := strings.Split(internal.MustEnv("URLS"), ",")
	log.Printf("visiting %d urls", len(urls))
	results := make([]uptime.MonitorResult, 0)
	timestamp := time.Now()
	for res := range monitor.Visit(urls) {
		switch v := res.(type) {
		case error:
			log.Fatalf("monitor failed: %s", v)
		case uptime.MonitorError:
			log.Fatalf("monitoring %s failed: %s", v.URL, v.Error)
		case uptime.MonitorResult:
			results = append(results, v)
		}
	}

	if l := len(results); l > 0 {
		log.Printf("persisting %d monitor data points to metric store", l)
		if err := store.Persist(timestamp, results); err != nil {
			log.Fatalf("failed to persist: %s", err)
		}
	}
}
