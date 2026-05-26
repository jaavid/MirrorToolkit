pipeline {
  agent any

  options {
    timestamps()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install system dependencies') {
      steps {
        sh '''
          sudo apt-get update
          sudo apt-get install -y shellcheck jq ripgrep
        '''
      }
    }

    stage('CLI validation') {
      steps {
        sh '''
          bash -n setup-mirrors.sh scripts/*.sh
          bash scripts/validate-json.sh
          bash setup-mirrors.sh --config mirrors.json --output /tmp/.env.mirrors --report /tmp/mirror-report.json --timeout 3
          bash scripts/smoke-test.sh
          shellcheck setup-mirrors.sh scripts/*.sh
        '''
      }
    }

    stage('Docs site build') {
      steps {
        dir('docs-site') {
          sh '''
            npm ci
            npm run build
          '''
        }
        sh '''
          test -d docs-site/dist
          test -f docs-site/dist/assets/tailwind.css
          ! rg -n -i "cdn\\.tailwindcss|fonts\\.googleapis|unpkg|jsdelivr" docs-site/dist
        '''
      }
    }
  }
}
