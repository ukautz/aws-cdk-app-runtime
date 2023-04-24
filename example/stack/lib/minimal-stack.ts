import { Cluster, Service } from '@ukautz/aws-cdk-app-runtime';
import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_rds as rds } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class MinimalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_23,
      }),
      vpc: cluster.vpc,
    });
    database.connections.allowFrom(service, ec2.Port.tcp(3306));
  }
}
