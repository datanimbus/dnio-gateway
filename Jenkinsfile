pipeline {
  agent any
  stages {
    stage('Checkin') {
      steps {
        sh '''echo "Hello World"
pwd
whoami'''
        pwd()
      }
    }
    stage('Test') {
      steps {
        sh '''echo "BUILD"
exit 0'''
      }
    }
  }
}
