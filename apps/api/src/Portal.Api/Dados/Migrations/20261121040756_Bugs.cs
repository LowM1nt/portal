using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class Bugs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "bugs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    relato = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    passos = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    esperado = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    obtido = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    severidade = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    origem = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    atualizado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bugs", x => x.id);
                    table.ForeignKey(
                        name: "FK_bugs_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bugs_workspace_id_status",
                table: "bugs",
                columns: new[] { "workspace_id", "status" });
            // Mesma regra da auditoria 20/11: toda tabela do schema public com RLS ligado.
            migrationBuilder.Sql("ALTER TABLE public.bugs ENABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "bugs");
        }
    }
}
