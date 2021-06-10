import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as appruntime from '@ukautz/aws-cdk-app-runtime';
import { contextOf } from '@ukautz/aws-cdk-envcontext';
import * as path from 'path';

const defaultServiceResources = 'cpu: 256, memory: 512, fixed: 1';
const defaultMonitorResources = 'cpu: 256, memory: 512, concurrent: 1';

export class UptimeApplicationsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const context = contextOf(this);
    const urls = context.must('urls').split(/\s*,\s*/);
    const monitorSchedule = context.may('monitorSchedule') || 'rate(5 minutes)';

    const namespace = context.must('namespace');
    const cluster = appruntime.ClusterSpecs.fromSsm(this, `/${namespace}/`);

    const metrics = new dynamodb.Table(this, 'MetricsTable', {
      partitionKey: {
        name: 'url',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // monitor that fetches metrics
    const monitorApp = new appruntime.ScheduledTask(this, 'Monitor', {
      cluster,
      image: 'path:' + path.join(__dirname, '..', '..'),
      name: 'monitor',
      schedule: monitorSchedule,
      dockerBuildArgs: {
        service: 'monitor',
      },
      environment: {
        URLS: urls.join(','),
        DYNAMODB_TABLE: metrics.tableName,
      },
      resources: appruntime.Resources.fromString(context.may('monitorAppResources') || defaultMonitorResources),
    });
    metrics.grantWriteData(monitorApp);

    const webApp = new appruntime.Service(this, 'WebApp', {
      cluster,
      image: 'path:' + path.join(__dirname, '..', '..'),
      name: 'webapp',
      public: false,
      dockerBuildArgs: {
        service: 'webapp',
      },
      environment: {
        URLS: urls.join(','),
        DYNAMODB_TABLE: metrics.tableName,
        SERVICE_ADDRESS: ':80',
        GIN_MODE: 'debug',
      },
      resources: appruntime.Resources.fromString(context.may('webAppResources') || defaultServiceResources),
    });
    metrics.grantReadData(webApp);

    const proxyApp = new appruntime.Service(this, 'ProxyApp', {
      cluster,
      image: 'path:' + path.join(__dirname, '..', '..', 'Dockerfile.proxy'),
      name: 'proxyapp',
      public: true,
      dockerBuildArgs: {
        publicDomain: webApp.clusterSpecs.publicDomain,
        privateDomain: webApp.clusterSpecs.privateDomain,
      },
      resources: appruntime.Resources.fromString(context.may('proxyAppResources') || defaultServiceResources),
    });
    webApp.connections.allowFrom(proxyApp, ec2.Port.tcp(80));
  }
}
