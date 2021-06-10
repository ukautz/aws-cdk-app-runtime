package uptime

import (
	"fmt"
	"time"

	"github.com/go-echarts/go-echarts/v2/charts"
	"github.com/go-echarts/go-echarts/v2/opts"
)

const (
	hour = 3600
	day  = hour * 24
)

func metricsToTimeLabels(metrics []MetricRecord) []string {
	if len(metrics) == 0 {
		return nil
	}
	t0 := metrics[0]
	tn := metrics[len(metrics)-1]

	// 2006-01-02T15:04:05Z07:00
	var format string
	diff := tn.Timestamp - t0.Timestamp
	if diff > day*7 {
		format = "2006-01-02"
	} else if diff > day {
		format = "01-02 15h"
	} else {
		format = "15:04"
	}

	labels := make([]string, len(metrics))
	for i, metric := range metrics {
		t := time.Unix(metric.Timestamp, 0)
		labels[i] = t.Format(format)
	}
	return labels
}

func buildResponseTimeChart(url string, metrics []MetricRecord) *charts.Line {
	chart := charts.NewLine()
	chart.SetGlobalOptions(
		charts.WithTitleOpts(opts.Title{
			Title: fmt.Sprintf("Request Response Time for %s", url),
		}),
		charts.WithYAxisOpts(opts.YAxis{
			Name: "Duration (ms)",
		}),
		charts.WithXAxisOpts(opts.XAxis{
			Name: "Time",
		}),
	)
	data := func() []opts.LineData {
		items := make([]opts.LineData, len(metrics))
		for i, metric := range metrics {
			ms := (float64(metric.ResponseTime) / float64(metric.Count)) / 1000
			items[i] = opts.LineData{Value: ms}
		}
		return items
	}
	chart.SetXAxis(metricsToTimeLabels(metrics)).AddSeries("Response Time", data())
	return chart
}

func buildResponseStatusChart(url string, metrics []MetricRecord) *charts.Bar {
	chart := charts.NewBar()
	chart.SetGlobalOptions(
		charts.WithTitleOpts(opts.Title{
			Title: fmt.Sprintf("Request Response Time for %s", url),
		}),
		charts.WithYAxisOpts(opts.YAxis{
			Name: "Percent",
		}),
		charts.WithXAxisOpts(opts.XAxis{
			Name: "Time",
		}),
		charts.WithLegendOpts(opts.Legend{
			Show:  true,
			Right: "0",
		}),
	)
	data := func(extract func(MetricRecord) int64) []opts.BarData {
		items := make([]opts.BarData, len(metrics))
		for i, metric := range metrics {
			avg := float64(extract(metric)) / float64(metric.Count)
			items[i] = opts.BarData{Value: avg * 100}
		}
		return items
	}
	chart.SetXAxis(metricsToTimeLabels(metrics))
	chart.AddSeries("1xx", data(func(m MetricRecord) int64 { return m.Count1xx }))
	chart.AddSeries("2xx", data(func(m MetricRecord) int64 { return m.Count2xx }))
	chart.AddSeries("3xx", data(func(m MetricRecord) int64 { return m.Count3xx }))
	chart.AddSeries("4xx", data(func(m MetricRecord) int64 { return m.Count4xx }))
	chart.AddSeries("5xx", data(func(m MetricRecord) int64 { return m.Count5xx }))

	return chart
}
