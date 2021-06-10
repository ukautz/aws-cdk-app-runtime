package uptime

import (
	"log"
	"net/http"
	"sync"
	"time"
)

type Monitor struct {
	Client *http.Client
}

type MonitorResult struct {
	URL          string
	ResponseTime time.Duration
	StatusCode   int
}

type MonitorError struct {
	URL   string
	Error error
}

func (m Monitor) Visit(urls []string) chan interface{} {
	result := make(chan interface{})
	go func() {
		defer close(result)
		var wg sync.WaitGroup
		for _, url := range urls {
			wg.Add(1)
			url := url
			go func() {
				defer wg.Done()
				duration, status, err := m.visit(url)
				if err != nil {
					result <- MonitorError{
						URL:   url,
						Error: err,
					}

				} else {
					log.Printf("sending result %d, %s", status, duration)
					result <- MonitorResult{
						URL:          url,
						ResponseTime: duration,
						StatusCode:   status,
					}
				}
			}()
		}
		wg.Wait()
	}()
	return result
}

func (m Monitor) visit(url string) (time.Duration, int, error) {
	start := time.Now()
	res, err := m.Client.Get(url)
	duration := time.Since(start)
	if err != nil {
		return duration, 0, err
	}

	return duration, res.StatusCode, nil
}
