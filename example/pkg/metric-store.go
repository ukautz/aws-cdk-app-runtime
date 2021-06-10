package uptime

import (
	"fmt"
	"log"
	"sort"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbiface"
	"github.com/aws/aws-sdk-go/service/dynamodb/expression"
)

type MetricStore struct {
	Table  string
	Modulo int
	Client dynamodbiface.DynamoDBAPI
}

const (
	metricAttribTimestamp    = "timestamp"
	metricAttribURL          = "url"
	metricAttribResponseTime = "response_time"
	metricAttribCount        = "count"
)

type MetricRecordKey struct {

	// Timestamp in unix time
	Timestamp int64 `json:"timestamp"`

	// URL that is monitored
	URL string `json:"url"`
}

type MetricRecordData struct {
	Count        int64 `json:"count"`
	Count1xx     int64 `json:"count_1xx"`
	Count2xx     int64 `json:"count_2xx"`
	Count3xx     int64 `json:"count_3xx"`
	Count4xx     int64 `json:"count_4xx"`
	Count5xx     int64 `json:"count_5xx"`
	ResponseTime int64 `json:"response_time"`
}

type MetricRecord struct {
	MetricRecordKey
	MetricRecordData
}

type MetricRecordAscending []MetricRecord

func (r MetricRecordAscending) Len() int {
	return len(r)
}

func (r MetricRecordAscending) Less(i, j int) bool {
	return r[i].Timestamp < r[j].Timestamp
}

func (r MetricRecordAscending) Swap(i, j int) {
	r[i], r[j] = r[j], r[i]
}

type MetricQuery struct {
	URL      string
	From, To time.Time
}

func (s MetricStore) Init() error {
	_, err := s.Client.CreateTable(&dynamodb.CreateTableInput{
		TableName: aws.String(s.Table),
		AttributeDefinitions: []*dynamodb.AttributeDefinition{
			{
				AttributeName: aws.String(metricAttribURL),
				AttributeType: aws.String("S"),
			},
			{
				AttributeName: aws.String(metricAttribTimestamp),
				AttributeType: aws.String("N"),
			},
		},
		KeySchema: []*dynamodb.KeySchemaElement{
			{
				AttributeName: aws.String(metricAttribURL),
				KeyType:       aws.String("HASH"),
			},
			{
				AttributeName: aws.String(metricAttribTimestamp),
				KeyType:       aws.String("RANGE"),
			},
		},
		ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
			ReadCapacityUnits:  aws.Int64(5),
			WriteCapacityUnits: aws.Int64(5),
		},
	})
	if err != nil {
		awsErr, ok := err.(awserr.Error)
		if ok && awsErr.Code() == "ResourceInUseException" {
			return nil
		} else if ok {
			log.Printf("ignore AWS error code: %s", awsErr.Code())
		}
		return err
	}
	return nil
}

func (s MetricStore) Persist(timestamp time.Time, results []MonitorResult) error {
	ts := timestamp.Unix()
	ts = ts - (ts % int64(s.Modulo))

	transaction := make([]*dynamodb.TransactWriteItem, len(results))
	for i, result := range results {
		update, err := s.createUpdate(ts, result)
		if err != nil {
			return fmt.Errorf("failed to create update %d: %w", i, err)
		}
		transaction[i] = &dynamodb.TransactWriteItem{Update: update}
	}

	_, err := s.Client.TransactWriteItems(&dynamodb.TransactWriteItemsInput{
		TransactItems: transaction,
	})

	return err
}

func (s MetricStore) Query(query MetricQuery) chan interface{} {
	result := make(chan interface{})
	go func() {
		defer close(result)

		urlCond := expression.Key(metricAttribURL).Equal(expression.Value(query.URL))
		timeCond := expression.Key(metricAttribTimestamp).Between(expression.Value(query.From.Unix()), expression.Value(query.To.Unix()))
		builder := expression.NewBuilder().WithKeyCondition(expression.KeyAnd(urlCond, timeCond))
		expr, err := builder.Build()
		if err != nil {
			result <- fmt.Errorf("failed to create expression: %w", err)
			return
		}

		err = s.Client.QueryPages(&dynamodb.QueryInput{
			TableName:                 aws.String(s.Table),
			ConsistentRead:            aws.Bool(true),
			KeyConditionExpression:    expr.KeyCondition(),
			ExpressionAttributeNames:  expr.Names(),
			ExpressionAttributeValues: expr.Values(),
		}, func(page *dynamodb.QueryOutput, isLast bool) bool {
			for _, item := range page.Items {
				var record MetricRecord
				if err := dynamodbattribute.UnmarshalMap(item, &record); err != nil {
					result <- fmt.Errorf("failed to decode dynamodb item: %w", err)
					return false
				}
				result <- record
			}
			return !isLast
		})
		if err != nil {
			result <- fmt.Errorf("failed to query pages: %w", err)
		}
	}()

	return result
}

func (s MetricStore) QueryAll(query MetricQuery) ([]MetricRecord, error) {
	records := make([]MetricRecord, 0)
	for item := range s.Query(query) {
		switch v := item.(type) {
		case error:
			return nil, v
		case MetricRecord:
			records = append(records, v)
		}
	}
	sort.Sort(MetricRecordAscending(records))
	return records, nil
}

func (s MetricStore) createUpdate(timestamp int64, result MonitorResult) (*dynamodb.Update, error) {
	key, err := dynamodbattribute.MarshalMap(MetricRecordKey{
		Timestamp: timestamp,
		URL:       result.URL,
	})
	if err != nil {
		return nil, err
	}

	status := fmt.Sprintf("%s_%dxx", metricAttribCount, result.StatusCode/100)
	update := expression.Add(
		expression.Name(metricAttribResponseTime),
		expression.Value(result.ResponseTime.Microseconds()),
	).Add(
		expression.Name(status),
		expression.Value(1),
	).Add(
		expression.Name(metricAttribCount),
		expression.Value(1),
	)
	expr, err := expression.NewBuilder().WithUpdate(update).Build()
	if err != nil {
		return nil, err
	}

	return &dynamodb.Update{
		TableName:                 aws.String(s.Table),
		Key:                       key,
		ExpressionAttributeNames:  expr.Names(),
		ExpressionAttributeValues: expr.Values(),
		UpdateExpression:          expr.Update(),
	}, nil
}
