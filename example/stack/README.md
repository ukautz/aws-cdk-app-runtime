# App Runtime: Uptime Monitor Stack

This is the AWS CDK application that deploys the example application runtime cluster with all the services.

The application consist of two stacks, which need to be deployed in the same AWS account. They can be deployed either together or separately.

## Stack Parameters

Stack Parameters are supplied with the `--context` parameter when executing `cdk`, for example:

```sh
$ cdk synth --context publicDomain=your-domain.tld
```

### Required Parameters

- `namespace`: A name that is unique per cluster. It will be used to store information in SSM under `/<namespace>/<param-name>`. This decouples the application stack from the cluster stack, so that both can be deployed separately. Usually you would deploy the cluster once and then add multiple applications over time.
- `publicDomain`: Each application is exposed under a sub-domain name like `app-123.apps.your-domain.tld`. The public domain is the parental domain (`apps.your-domain.tld`), which needs to be owned and maintained by this stack.
- `privateDomain`: For internal use, and because not all installed applications may be publicly accesible, the cluster uses also an internal domain. This domain does not need to be resolvable outside and can be something like `service.local` or `local.your-domain.tld`. It will be only resolvable from within the cluster.

### Optional Parameters

- `routerSecret`: String in the format `<key>: <value>`. Sets a required header in the router (ALB). Simple way to ensure ALB accepts only traffic from CloudFront (which needs to be configured to inject this header into each delegated request)
- ``

AWS CDK implementation of an application infrastructure of an Uptime Monitor. Two CDK applications are provided:

- `bin/cluster.ts` - implements the application runtime infrastructure to run the services
- `bin/applications.ts` - implements the Uptime Monitor components, which consist of
  - a monitor, a Scheduled Tasks, that queries a set of URLs in defined intervals to persist the measured response time and status codes into an DynamoDB table
  - a web applcation, a Service, that offers a UI and API for the collected metrics in the DynamoDB table

## Deployment

## Context Parameters

- **`urls`**: Comma separated list of URLs to be monitored for uptime
- **`parentDomain`**: Domain name of the parental hosted zone, e.g. `public.domain`
- **`publicDomain`**: The public domain under which the services will be exposed, e.g. `apps.public.domain`
- `privateDomain`: The internal domain under which the services are internally exposed, e.g. `service.local` (default: `service.local`)
- `routerSecret`: Optional HTTP header name and value for [listener rule](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html#listener-rules), that rejects all requests not having the header with the value (example: `x-my-auth: secret-12345`, use case: limit access to only from CloudFront)
- `maxAzs`: Max amount of availability zones that are being used (depending on availability in the region) (default: `2`)
- `natInstanceType`: Optional name of instance type to use as [NAT instance in replace of NAT gateway](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-comparison.html), e.g. `t3.micro` (default: empty, so use NAT gateway)
