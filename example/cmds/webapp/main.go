package main

import (
	"log"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ukautz/aws-cdk-app-runtime/example/cmds/internal"
	uptime "github.com/ukautz/aws-cdk-app-runtime/example/pkg"

	_ "embed"
)

func main() {
	log.Println("starting webapp")

	urls := strings.Split(internal.MustEnv("URLS"), ",")
	store := internal.InitMetricStore()
	engine := gin.Default()
	router := uptime.NewRouter(store, urls)
	router.Bind(engine)

	if err := engine.Run(internal.MayEnv("SERVICE_ADDRESS")); err != nil {
		log.Fatalf("failed to run: %s", err)
	}
}
