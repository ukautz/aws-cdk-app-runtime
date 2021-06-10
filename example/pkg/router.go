package uptime

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ukautz/aws-cdk-app-runtime/example/pkg/template"

	"github.com/go-echarts/go-echarts/v2/components"
)

type Router struct {
	MetricStore MetricStore
	URLs        []string
}

func NewRouter(metricStore MetricStore, urls []string) *Router {
	return &Router{
		MetricStore: metricStore,
		URLs:        urls,
	}
}

func (r *Router) Bind(engine *gin.Engine) {
	engine.GET("/ping", r.ping)
	engine.GET("/metrics", r.metrics)
	engine.GET("/charts", r.charts)
	engine.GET("/", r.overview)

}

func (r *Router) isValidURL(url string) bool {
	for _, u := range r.URLs {
		if u == url {
			return true
		}
	}
	return false
}

func (r *Router) ping(c *gin.Context) {
	c.JSON(200, gin.H{
		"message": "pong",
	})
}

func (r *Router) overview(c *gin.Context) {
	out := bytes.NewBuffer(nil)
	err := template.HomeTemplate.Execute(out, map[string]interface{}{
		"noPrefix": c.GetBool("noPrefix"),
		"urls":     r.URLs,
	})
	if err != nil {
		c.String(http.StatusInternalServerError, "failed to render home: %s", err)
		return
	}
	c.Data(http.StatusOK, "text/html", out.Bytes())
}

func (r *Router) metrics(c *gin.Context) {
	url, metrics, err := r.metricsQuery(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
	} else if url == "" {
		c.JSON(200, gin.H{
			"urls": r.URLs,
		})
		return
	}
	c.JSON(200, gin.H{
		"metrics": metrics,
	})
}

func (r *Router) charts(c *gin.Context) {
	url, metrics, err := r.metricsQuery(c)
	if err != nil {
		c.String(http.StatusInternalServerError, "failed to get metrics: %s", err)
		return
	} else if url == "" {
		c.Set("noPrefix", true)
		r.overview(c)
		return
	}
	page := components.NewPage()
	page.AddCharts(
		buildResponseTimeChart(url, metrics),
		buildResponseStatusChart(url, metrics),
	)

	page.Render(c.Writer)
}

func (r *Router) metricsQuery(c *gin.Context) (string, []MetricRecord, error) {
	url := c.Request.URL.Query().Get("url")
	if url == "" {
		return "", nil, nil
	} else if !r.isValidURL(url) {
		return "", nil, errors.New("invalid url")
	}

	from, to, err := getFromToFromQuery(c)
	if err != nil {
		return "", nil, err
	}

	metrics, err := r.MetricStore.QueryAll(MetricQuery{URL: url, From: from, To: to})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
	}

	return url, metrics, nil
}

func getFromToFromQuery(c *gin.Context) (time.Time, time.Time, error) {
	from, err := getTimeFromQuery(c, "from")
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("time from invalid: %w", err)
	}
	to, err := getTimeFromQuery(c, "to")
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("time to invalid: %w", err)
	}
	now := time.Now()
	if to == nil || to.After(now) {
		to = &now
	}
	if from == nil || from.After(*to) {
		before := (*to).Add(time.Hour * -1)
		from = &before
	}
	return *from, *to, nil
}

func getTimeFromQuery(c *gin.Context, name string) (*time.Time, error) {
	str := c.Request.URL.Query().Get(name)
	if str == "" {
		return nil, nil
	}
	secs, err := strconv.Atoi(str)
	if err != nil {
		return nil, err
	}

	t := time.Unix(int64(secs), 0)
	return &t, nil
}
