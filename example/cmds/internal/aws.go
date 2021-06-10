package internal

import (
	"log"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
)

var (
	AWSSession *session.Session
)

func init() {
	var err error
	// Equivalent to session.NewSession()
	AWSSession, err = session.NewSessionWithOptions(session.Options{
		Config: aws.Config{
			Region: aws.String(MustEnv("AWS_DEFAULT_REGION")),
		},
	})
	if err != nil {
		log.Fatalf("failed to init AWS session: %s", err)
	}
}
