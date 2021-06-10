package internal

import (
	"log"

	"github.com/aws/aws-sdk-go/service/dynamodb"
	uptime "github.com/ukautz/aws-cdk-app-runtime/example/pkg"
)

func InitMetricStore() uptime.MetricStore {
	store := uptime.MetricStore{
		Table:  MustEnv("DYNAMODB_TABLE"),
		Modulo: MayEnvInt("MODULO", 300),
		Client: dynamodb.New(AWSSession), //, aws.NewConfig().WithLogLevel(aws.LogDebugWithHTTPBody)),
	}
	if MayEnvBool("INIT_DYNAMODB_TABLE", false) {
		if err := store.Init(); err != nil {
			log.Fatalf("failed to init store: %s", err)
		}
	}
	return store
}
