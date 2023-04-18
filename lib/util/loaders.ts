import { aws_certificatemanager as acm, aws_route53 as route53 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const loadCertificate = (
  scope: Construct,
  certificate?: boolean | string | acm.ICertificate,
  defaultValue?: () => acm.ICertificate | undefined
): acm.ICertificate | undefined => {
  if (certificate === false) {
    return;
  } else if (typeof certificate === 'string') {
    return acm.Certificate.fromCertificateArn(scope, 'Certificate', certificate);
  } else if (certificate !== true) {
    return certificate;
  }
  return defaultValue ? defaultValue() : undefined;
};

export const loadHostedZone = (
  scope: Construct,
  from: string | route53.IHostedZone | undefined,
  defaultValue: () => route53.IHostedZone
): route53.IHostedZone =>
  from
    ? typeof from === 'string'
      ? route53.HostedZone.fromLookup(scope, 'HostedZone', {
          domainName: from,
        })
      : from
    : defaultValue();
