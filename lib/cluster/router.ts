import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as iam from '@aws-cdk/aws-iam';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import * as service from '../service';
import * as util from '../util';
import { loadCertificate } from '../util/loaders';

const defaultEnforceHttps = true;
const defaultRouterImage = 'traefik';
const defaultRouterImageVersion = '2.4';

export interface RouterProps extends RouterPropsExposed {
  readonly cluster: ecs.ICluster;
  readonly certificate?: boolean | string | acm.ICertificate;
  readonly hostedZone: route53.IHostedZone;
  readonly publicDomain: string;
}
export interface RouterPropsExposed {
  /**
   * Whether to enforce HTTPs (redirect all incoming HTTP requests to HTTPS)
   */
  readonly enforceHttps?: boolean;

  /**
   * Optional traffic route condition in the load balancer (e.g. when behind CloudFront to assure only CF sends traffic)
   */
  readonly requireHeader?: { name: string; values: string[] };

  /**
   * Optionally provided logging settings. Either a proper log driver, or false
   * to disable logging or a string used a as prefix for CloudWatch logs or
   * default value for cloudwatch logs
   */
  readonly logging?: ecs.LogDriver | string | false;

  /**
   * The log level for Traefik
   *
   * @see https://doc.traefik.io/traefik/observability/logs/#level
   * @default ERROR
   */
  readonly logLevel?: string;

  /**
   * The resources that the router service should have
   */
  readonly resources?: string | util.ResourcesProps;

  /**
   * The image the container is to be started from. Can be:
   * * ecr:<arn>
   * * path:</to/folder/with/dockerfile>
   * * <dockerhub image>
   *
   * @see https://hub.docker.com/_/traefik
   * @default traefik (dockerhub image)
   */
  readonly image?: string | ecs.ContainerImage;

  /**
   * The tag / version of the image to be run.
   * * for ecr:
   *
   * @see https://hub.docker.com/_/traefik
   * @default 2.4
   */
  readonly imageVersion?: string;
}

export interface RouterSpecs {
  /**
   * ARN of the (fargate) ECS <TODO> that
   */
  routerArn: string;

  /**
   * ARN of the certificate that terminates the domain and wildcard.domain
   */
  routerCertificateArn?: string;

  /**
   * ARN of the load balancer in-front of the router service
   */
  routerLoadBalancerArn: string;

  /**
   * DNS name of the load balancer in-front of the router service
   */
  routerLoadBalancerDnsName: string;

  /**
   * ID of the security group associated with the load balancer
   */
  routerLoadBalancerSecurityGroupId: string;

  /**
   * ARN of the IAM role that the router service assumes at runtime
   */
  routerRoleArn: string;

  /**
   * Security group IDs of the router service, separated by ","
   */
  routerSecurityGroupIds: string;

  /**
   * ARN of the TaskDefinition that implements the router service
   */
  routerTaskDefinitionArn: string;
}

/**
 * Router takes exposes public services under a shared public domain. http(s)://service-name.public.domain/
 *
 * Components:
 * - A container image of Traefik
 * - An ECS Fargate task that runs the container image and exposes it via
 * - An ALB, offering HTTP and HTTPS, using a provided certificate (optional HTTP -> HTTPS redirect)
 * - A certificate for the wildcard of the (cluster) public domain (`*.public.domain`) securing the ALB
 * - A wildcard record in the cluster hosted zone pointing to the ALB
 *
 * Integration:
 * - IGrantable: So that running ECS service can access AWS API (e.g. Traefik scans ECS for services it should route to)
 * - IConnectable: So that running ECS service can access
 *
 * Considerations:
 * - Multiple routing models? This is a shared model, using a hostname based routing with Traefik behind an ALB. Other models could dedicate resources (i.e. an ALB per service) etc.
 */
export class Router extends cdk.Construct implements iam.IGrantable, ec2.IConnectable {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.IApplicationLoadBalancer;
  public readonly grantPrincipal: iam.Role;
  public readonly certificate?: acm.ICertificate;
  private readonly resources: util.Resources;

  constructor(scope: cdk.Construct, id: string, props: RouterProps) {
    super(scope, id);

    this.resources =
      typeof props.resources === 'string'
        ? util.Resources.fromString(props.resources)
        : new util.Resources(props.resources);

    this.certificate = this.initCertificate(props);
    this.grantPrincipal = this.createServiceTaskRole(props);

    const image = this.initImage(props);
    this.service = this.createService(props, image);
    this.loadBalancer = this.initLoadBalancer(props);
    this.setupAutoScaling();
    this.routeToLoadBalancer(props);
    this.publishInClusterNamespace(props);
  }

  public get connections(): ec2.Connections {
    return this.service.connections;
  }

  public get specs(): RouterSpecs {
    return {
      routerArn: this.service.serviceArn,
      routerCertificateArn: this.certificate?.certificateArn,
      routerLoadBalancerArn: this.loadBalancer.loadBalancerArn,
      routerLoadBalancerDnsName: this.loadBalancer.loadBalancerDnsName,
      routerLoadBalancerSecurityGroupId: this.loadBalancer.connections.securityGroups
        .map((sg) => sg.securityGroupId)
        .join(','),
      routerRoleArn: this.service.taskDefinition.taskRole.roleArn,
      routerSecurityGroupIds: this.service.connections.securityGroups.map((sg) => sg.securityGroupId).join(','),
      routerTaskDefinitionArn: this.service.taskDefinition.taskDefinitionArn,
    };
  }

  /**
   * Create or load certificate; for creation DNS validation in hosted zone is used
   */
  private initCertificate(props: RouterProps): acm.ICertificate | undefined {
    return loadCertificate(
      this,
      props.certificate,
      () =>
        new acm.DnsValidatedCertificate(this, 'Certificate', {
          domainName: `*.${props.publicDomain}`,
          hostedZone: props.hostedZone,
          //validation: acm.CertificateValidation.fromDns(this.hostedZone),
        })
    );
  }

  /**
   * Either build docker image on the fly and upload to ECR of this CDK; or use provided
   * @param props
   */
  private initImage(props: RouterProps): ecs.ContainerImage {
    if (typeof props.image !== 'string' && props.image) {
      return props.image;
    }
    const { image } = service.loadContainerImage(
      this,
      props.image ?? defaultRouterImage,
      props.imageVersion ?? defaultRouterImageVersion
    );
    return image;
  }

  /**
   * Creates ECR task that runs the Traefik container image
   * @param props
   * @param image
   */
  private createService(props: RouterProps, image: ecs.ContainerImage): ecs.FargateService {
    // create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: this.resources.cpu,
      memoryLimitMiB: this.resources.memory,
      taskRole: this.grantPrincipal,
    });

    const logging = util.ecsLogDriver(props.logging ?? '/cluster/router');

    const container = taskDefinition.addContainer('Container', {
      logging,
      /* dockerLabels: {
        'traefik.domain': props.domainName,
      }, */
      environment: {
        TRAEFIK_ENTRYPOINTS_HTTP: 'true',
        TRAEFIK_ENTRYPOINTS_HTTP_ADDRESS: ':80',
        TRAEFIK_LOG: 'true',
        TRAEFIK_LOG_LEVEL: props.logLevel ?? 'ERROR',
        TRAEFIK_PING: 'true',
        TRAEFIK_PING_ENTRYPOINT: 'http',
        TRAEFIK_PROVIDERS_ECS: 'true',
        TRAEFIK_PROVIDERS_ECS_REFRESHSECONDS: '10',
        TRAEFIK_PROVIDERS_ECS_CLUSTERS: props.cluster.clusterName,
        TRAEFIK_PROVIDERS_ECS_REGION: cdk.Aws.REGION,
      },
      image,
    });

    container.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    let args: Partial<ecs.FargateServiceProps> = {};
    if (this.resources.scaling.mode === 'fixed') {
      args = { ...args, desiredCount: this.resources.scaling.amount };
    }

    const service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition,
      ...args,
    });

    return service;
  }

  /**
   * Configures services scaling configuration
   */
  private setupAutoScaling(): void {
    new service.Scaler(this, 'Scaler', {
      scaling: this.resources.scaling,
      service: this.service,
    });
  }

  /**
   * Creates the ALB that exposes the ECS task to the interwebs
   * @param props
   */
  private initLoadBalancer(props: RouterProps): elbv2.ApplicationLoadBalancer {
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc: props.cluster.vpc,
      http2Enabled: true,
      internetFacing: true,
      // TODO: idle timeout etc
    });

    // create HTTP listener and init list of forwarders (whose default action will be to forward to target(s))
    const createHttpListener = (action?: elbv2.ListenerAction): elbv2.ApplicationListener =>
      loadBalancer.addListener('HttpListener', {
        port: 80,
        open: true,
        defaultAction: action,
      });
    const forwarders: elbv2.ApplicationListener[] = [];

    // with certificate; create HTTPS listener
    if (this.certificate) {
      forwarders.push(
        loadBalancer.addListener('HttpsListener', {
          port: 443,
          open: true,
          certificates: [this.certificate],
        })
      );

      // redirect all HTTP requests to HTTPS? (default)
      if (props.enforceHttps ?? defaultEnforceHttps) {
        createHttpListener(
          elbv2.ListenerAction.redirect({
            port: '443',
            protocol: 'HTTPS',
            permanent: true,
          })
        );
      } else {
        forwarders.push(createHttpListener());
      }
    } else {
      forwarders.push(createHttpListener());
    }

    // optional: safe-guard load balancer access by checking for
    //   user defined request header and value. Use case: behind CloudFront
    const conditions = props.requireHeader
      ? {
          conditions: [elbv2.ListenerCondition.httpHeader(props.requireHeader.name, props.requireHeader.values)],
          priority: 1,
        }
      : {};

    // route incoming traffic for listeners
    forwarders.forEach((listener) => {
      listener.addTargets('EcsService', {
        port: 80,
        targets: [
          this.service.loadBalancerTarget({
            containerName: 'Container',
            containerPort: 80,
          }),
        ],
        healthCheck: {
          path: '/ping',
        },
        ...conditions,
      });
      if ('priority' in conditions) {
        listener.addAction('MissingHeader', {
          action: elbv2.ListenerAction.fixedResponse(403, {
            contentType: 'text/plain',
            messageBody: 'Forbidden',
          }),
        });
      }
    });

    return loadBalancer;
  }

  /**
   * Routes all subdomains (wildcard) of public domain to load balancer
   *
   * <code>
   *   foo-app.public.domain \                     / service foo-app
   *    barbar.public.domain  --> load balancer --> service barbar
   *         *.public.domain /                     \ etc
   * </code>
   *
   * @param props
   */
  private routeToLoadBalancer(props: RouterProps): void {
    [`*.${props.publicDomain}`].forEach((domain) => {
      new route53.ARecord(this, `RouterRecord${domain}`, {
        recordName: domain,
        zone: props.hostedZone,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(this.loadBalancer)),
      });
    });
  }

  private publishInClusterNamespace(props: RouterProps) {
    const service = new servicediscovery.Service(this, 'NamespaceRecord', {
      namespace: props.cluster!.defaultCloudMapNamespace!,
      name: '_router',
      description: 'Traefik router',
    });
    this.service.associateCloudMapService({ service });
  }

  /**
   * Creates IAM role, including policy, to be attached to ECS task, so that
   * Treafik is allowed to scan the ECS cluster it runs in
   * @param props
   */
  private createServiceTaskRole(props: RouterProps) {
    // TODO: specify conditions for IAM principal, so that only they can..
    /* const conditions = {
      conditions: {
        "StringEquals": {
          "aws:sourceVpc": props.cluster.vpc.vpcId,
        }
      }
    }; */
    return new iam.Role(this, 'RouterTaskRole', {
      description:
        'Role that router service container assumes so that it communicate with ECS and EC2 APIs to auto-detect services (containers) to route traffic to',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        TraefikTaskRolePolicy: new iam.PolicyDocument({
          statements: [
            // policy for traefik from: https://doc.traefik.io/traefik/providers/ecs/#policy
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: ['*'],
              actions: [
                'ec2:DescribeInstances',
                'ecs:ListClusters',
                'ecs:DescribeClusters',
                'ecs:ListTasks',
                'ecs:DescribeTasks',
                'ecs:DescribeContainerInstances',
                'ecs:DescribeTaskDefinition',
              ],
            }),
          ],
        }),
      },
    });
  }
}
