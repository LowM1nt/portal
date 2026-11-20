using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class ModeloDados : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "repositorios",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_repositorios", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "deploys",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    repositorio_id = table.Column<Guid>(type: "uuid", nullable: false),
                    titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ambiente = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    agendado_para = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deploys", x => x.id);
                    table.ForeignKey(
                        name: "FK_deploys_repositorios_repositorio_id",
                        column: x => x.repositorio_id,
                        principalTable: "repositorios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pull_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    repositorio_id = table.Column<Guid>(type: "uuid", nullable: false),
                    numero = table.Column<int>(type: "integer", nullable: false),
                    titulo = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    autor = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    estado = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pull_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_pull_requests_repositorios_repositorio_id",
                        column: x => x.repositorio_id,
                        principalTable: "repositorios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_deploys_repositorio_id",
                table: "deploys",
                column: "repositorio_id");

            migrationBuilder.CreateIndex(
                name: "IX_deploys_workspace_id",
                table: "deploys",
                column: "workspace_id");

            migrationBuilder.CreateIndex(
                name: "IX_deploys_workspace_id_agendado_para",
                table: "deploys",
                columns: new[] { "workspace_id", "agendado_para" });

            migrationBuilder.CreateIndex(
                name: "IX_pull_requests_repositorio_id",
                table: "pull_requests",
                column: "repositorio_id");

            migrationBuilder.CreateIndex(
                name: "IX_pull_requests_workspace_id",
                table: "pull_requests",
                column: "workspace_id");

            migrationBuilder.CreateIndex(
                name: "IX_pull_requests_workspace_id_criado_em",
                table: "pull_requests",
                columns: new[] { "workspace_id", "criado_em" });

            migrationBuilder.CreateIndex(
                name: "IX_pull_requests_workspace_id_repositorio_id_numero",
                table: "pull_requests",
                columns: new[] { "workspace_id", "repositorio_id", "numero" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_repositorios_workspace_id",
                table: "repositorios",
                column: "workspace_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "deploys");

            migrationBuilder.DropTable(
                name: "pull_requests");

            migrationBuilder.DropTable(
                name: "repositorios");
        }
    }
}
