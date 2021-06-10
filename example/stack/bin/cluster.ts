#!/usr/bin/env node
import 'source-map-support/register';
import * as envcontext from '@ukautz/aws-cdk-envcontext';
import { UptimeClusterStack } from '../lib/uptime-cluster-stack';

const app = new envcontext.App();
new UptimeClusterStack(app, 'UptimeCluster', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
