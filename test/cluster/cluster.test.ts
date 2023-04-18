import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Cluster } from '../../lib/cluster';
import { expectSnapshot } from '../util';

const newStack = () =>
  new cdk.Stack(undefined, 'Stack', {
    env: {
      account: '123213123',
      region: 'us-east-1',
    },
  });

describe('Runtime Cluster', () => {
  describe('Default Setup', () => {
    const stack = newStack();
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
    });
    const template = Template.fromStack(stack);

    expectSnapshot(template);

    const countAzs = stack.availabilityZones.length;
    expectInAllAzs(template, countAzs);
    expectNatSetting(template, 'gateway', countAzs);
    expectCertificate(template, false);
  });
  describe('Limited AZs', () => {
    const stack = newStack();
    const countAzs = stack.availabilityZones.length;
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
      maxAzs: countAzs - 1,
    });
    const template = Template.fromStack(stack);

    expectSnapshot(template);
    expectInAllAzs(template, countAzs - 1);
  });
  describe('Use NAT instances', () => {
    const stack = newStack();
    const countAzs = stack.availabilityZones.length;
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
      natInstanceType: 't3.micro',
    });
    const template = Template.fromStack(stack);

    expectSnapshot(template);
    expectNatSetting(template, 'instance', countAzs);
  });
  describe('Maintained certificate', () => {
    const stack = newStack();
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
      certificate: true,
    });
    const template = Template.fromStack(stack);

    expectSnapshot(template);
    expectCertificate(template, true);
  });
});

function expectInAllAzs(template: Template, azs: number) {
  test('Is in all AZs', () => {
    template.resourceCountIs('AWS::EC2::Subnet', azs * 2);
    template.resourceCountIs('AWS::EC2::RouteTable', azs * 2);
    template.resourceCountIs('AWS::EC2::SubnetRouteTableAssociation', azs * 2);
  });
}

function expectNatSetting(template: Template, kind: 'gateway' | 'instance', azs: number) {
  if (kind == 'gateway') {
    test('NAT Gateways in all AZs', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', azs);
      template.resourceCountIs('AWS::EC2::EIP', azs);
    });
  } else {
    test('NAT Instances in all AZs', () => {
      template.resourceCountIs('AWS::IAM::InstanceProfile', azs);
      template.resourceCountIs('AWS::EC2::Instance', azs);
    });
  }
}

function expectCertificate(template: Template, created: boolean) {
  if (created) {
    test('Certificate is maintained', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'index.certificateRequestHandler',
      });
    });
  } else {
    test('No certificate maintained', () => {
      template.resourceCountIs('AWS::Lambda::Function', 0);
    });
  }
}

/* function expectCertificateACM(template: Template, created: boolean) {
  if (created) {
    test('Certificate is maintained', () => {
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: '*.public.domain',
      });
    });
  } else {
    test('No certificate maintained', () => {
      template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    });
  }
} */
