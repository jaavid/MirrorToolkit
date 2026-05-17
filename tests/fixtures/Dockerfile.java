FROM maven:3.9-eclipse-temurin-17
# mirror-toolkit: enable-maven-mirror
RUN mvn -v
