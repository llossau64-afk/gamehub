# Build from the GuessTheAnswer folder (the server compiles the Unity project's Shared code and question packs):
#   docker build -f Server/Dockerfile -t guess-the-answer-server .
#   docker run -p 8080:8080 guess-the-answer-server
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Assets/GuessTheAnswer/Scripts/Shared Assets/GuessTheAnswer/Scripts/Shared
COPY Assets/GuessTheAnswer/Resources/GTA/Data Assets/GuessTheAnswer/Resources/GTA/Data
COPY Server/Shared Server/Shared
COPY Server/GameServer Server/GameServer
RUN dotnet publish Server/GameServer/GameServer.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "GuessTheAnswer.Server.dll"]
