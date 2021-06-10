#!/usr/bin/env node
import 'source-map-support/register';
import * as envcontext from '@ukautz/aws-cdk-envcontext';
import { UptimeApplicationsStack } from '../lib/uptime-applications-stack';

const app = new envcontext.App();
new UptimeApplicationsStack(app, 'UptimeApplications', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
