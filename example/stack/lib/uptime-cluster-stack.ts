import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as appruntime from '@ukautz/aws-cdk-app-runtime';
import { contextOf } from '@ukautz/aws-cdk-envcontext';

const parseRouterSecret = (secret: string | undefined): { name: string; values: string[] } | undefined => {
  if (!secret) return undefined;
  const parts = secret.split(/\s*:\s*/, 2);
  if (parts.length != 2) throw new Error(`router secret should be in format: "key: value"`);
  return { name: parts[0], values: [parts[1]] };
};

export class UptimeClusterStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const context = contextOf(this);
    const namespace = context.must('namespace');
    const routerSecret = parseRouterSecret(context.may('routerSecret'));

    const cluster = new appruntime.Cluster(this, 'Cluster', {
      privateDomain: context.may('privateDomain') ?? 'service.local',
      publicDomain: context.must('publicDomain'),
      hostedZone: context.may('hostedZone'),
      certificate: true,
      maxAzs: parseInt(context.may('maxAzs') ?? '2'),
      natInstanceType: context.may('natInstanceType'),
      routerProps: {
        logLevel: 'DEBUG',
        requireHeader: routerSecret,
        resources: context.may('routerResources'),
      },
    });

    // store cluster specs in SSM, so application stacks, that use this cluster, can be defined independently
    appruntime.ClusterSpecs.toSsm(this, `/${namespace}/`, cluster.specs);
  }
}
