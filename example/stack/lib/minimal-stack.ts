import * as cdk from '@aws-cdk/core';
import { DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion } from '@aws-cdk/aws-rds';
import { Port } from '@aws-cdk/aws-ec2';
import { Cluster, Service } from '@ukautz/aws-cdk-app-runtime';
import * as path from 'path';

export class MinimalStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const publicDomain = this.node.tryGetContext('publicDomain');
    if (!publicDomain) {
      throw new Error('missing publicDomain in context');
    }

    const cluster = new Cluster(this, 'Cluster', {
      publicDomain,
      privateDomain: this.node.tryGetContext('privateDomain') ?? 'service.local',
    });

    const service = new Service(this, 'WebApp', {
      cluster,
      image: 'path:' + path.join(__dirname, '..'),
      name: 'my-app',
      public: true,
    });

    const database = new DatabaseInstance(this, 'Database', {
      engine: DatabaseInstanceEngine.mysql({
        version: MysqlEngineVersion.VER_8_0_23,
      }),
      vpc: cluster.vpc,
    });
    database.connections.allowFrom(service, Port.tcp(3306));
  }
}
