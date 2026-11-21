using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class ItensRoadmap : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "itens_roadmap",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    descricao = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    prazo = table.Column<DateOnly>(type: "date", nullable: true),
                    progresso = table.Column<int>(type: "integer", nullable: false),
                    deploy_id = table.Column<Guid>(type: "uuid", nullable: true),
                    pull_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    atualizado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_itens_roadmap", x => x.id);
                    table.ForeignKey(
                        name: "FK_itens_roadmap_deploys_deploy_id",
                        column: x => x.deploy_id,
                        principalTable: "deploys",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_itens_roadmap_pull_requests_pull_request_id",
                        column: x => x.pull_request_id,
                        principalTable: "pull_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_itens_roadmap_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_itens_roadmap_deploy_id",
                table: "itens_roadmap",
                column: "deploy_id");

            migrationBuilder.CreateIndex(
                name: "IX_itens_roadmap_pull_request_id",
                table: "itens_roadmap",
                column: "pull_request_id");

            migrationBuilder.CreateIndex(
                name: "IX_itens_roadmap_workspace_id_status",
                table: "itens_roadmap",
                columns: new[] { "workspace_id", "status" });
            // Mesma regra da auditoria de 20/11: tabela nova nasce com RLS ligado (bloqueia a API REST do Supabase).
            migrationBuilder.Sql("ALTER TABLE itens_roadmap ENABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "itens_roadmap");
        }
    }
}
