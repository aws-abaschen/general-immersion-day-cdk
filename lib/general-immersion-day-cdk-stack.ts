import * as cdk from 'aws-cdk-lib';
import { AmazonLinuxCpuType, AmazonLinuxGeneration, AmazonLinuxImage, CfnLaunchTemplate, GatewayVpcEndpointAwsService, Instance, InstanceType, IpAddresses, SecurityGroup, SubnetType, UserData, Vpc } from 'aws-cdk-lib/aws-ec2';
import { CpuArchitecture } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class GeneralImmersionDayCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'vpc', {
      maxAzs: 2,
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true
    });

    //create Gateway VpcEndpoint for s3 for private subnets with egress
    const s3Endpoint = vpc.addGatewayEndpoint('s3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: SubnetType.PRIVATE_WITH_EGRESS }],
    });
    //give full access to s3Endpoint
    s3Endpoint.addToPolicy(new PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['s3:*'],
      resources: ['*'],
      principals: [new cdk.aws_iam.AnyPrincipal()]
    }));
    const ec2UserDataWebServer = UserData.forLinux();
    ec2UserDataWebServer.addCommands(
      'dnf install -y httpd wget php-fpm php-mysqli php-json php php-devel',
      'dnf install -y mariadb105-server',
      'dnf install -y httpd php-mbstring',
      //Start the web server
      'chkconfig httpd on',
      'systemctl start httpd',

      //Install the web pages for our lab
      `if [ ! -f /var/www/html/immersion-day-app-php7.zip ]; then
        cd /var/www/html
        wget -O 'immersion-day-app-php7.zip' 'https://static.us-east-1.prod.workshops.aws/ba07580b-344f-469c-bd22-5cdb3818d802/assets/immersion-day-app-php7.zip?Key-Pair-Id=K36Q2WVO3JP7QD&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9zdGF0aWMudXMtZWFzdC0xLnByb2Qud29ya3Nob3BzLmF3cy9iYTA3NTgwYi0zNDRmLTQ2OWMtYmQyMi01Y2RiMzgxOGQ4MDIvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTcxMzkxMzE0NH19fV19&Signature=c4Es5V8ZhYM8IuVxR3Z1t424OY7237lbMmD9q3JzqszLtaMxy8P3Cw3bMF3Ormw6XUieYcVTH-uxM2KjPL8YCXkxv~xTcUA6b3j-Z3ovAivm8oGQIkzqj0Phu3oAF9xATP~Q6ebzpn8-6GtQ~ce764YeHXf-U--TiwnANGP6X6oyzawrBaXwcWOKr34vRRfXUuiji6Ulij37MqGfnt3HgCaq8eoKijjJQuDJCBcLfmt-tZQ5RI8RmY6c1CAxRmBj1Yq-NlWnam8jITw-jx8GXIuQHesJQ-m0nA6iqtYLSyYAslxEbhAdx3jtpdKdXWbGTRQOKvZW8Fh3Xq3-078OFg__'
        unzip immersion-day-app-php7.zip
      fi`,

      //#Install the AWS SDK for PHP
      `if [ ! -f /var/www/html/aws.zip ]; then
        cd /var/www/html
        mkdir vendor
        cd vendor
        wget https://docs.aws.amazon.com/aws-sdk-php/v3/download/aws.zip
        unzip aws.zip
      fi`,

      //# Update existing packages
      'dnf update -y'
    );
    const sgWebServer = new SecurityGroup(this, 'webServerSecurityGroup', {
      vpc,
      description: 'Web Server Security Group'
    });
    sgWebServer.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80));
    sgWebServer.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(22));

    //EC2 metadata must use V2 only
    const ec2WebServer = new Instance(this, 'webServer', {
      instanceName: 'WebServer Instance',
      requireImdsv2: true, //add instance metadata for token v2
      vpc,
      instanceType: new InstanceType('t2.micro'),
      machineImage: new AmazonLinuxImage({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2023, cpuType: AmazonLinuxCpuType.X86_64 }),
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC
      },
      associatePublicIpAddress: true,
      securityGroup: sgWebServer,
      userData: ec2UserDataWebServer
    });
    

    //output the ec2 public IP
    new cdk.CfnOutput(this, 'ec2PublicIp', {
      value: ec2WebServer.instancePublicIp,
      description: 'The public IP of the web server',
      exportName: 'ec2PublicIp'
    });
    new cdk.CfnOutput(this, 'ec2PublicDnsName', {
      value: ec2WebServer.instancePublicDnsName,
      description: 'The public DNS of the web server',
      exportName: 'ec2PublicDnsName'
    });


    //// Create AMI
    const webServerAmi = new AmazonLinuxImage({
      cpuType: AmazonLinuxCpuType.X86_64,
      generation: AmazonLinuxGeneration.AMAZON_LINUX_2023,
      userData: ec2UserDataWebServer
    });
  }
}
